const axios = require('axios');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const fs = require('fs');
const path = require('path');

const BREVO_BASE_URL = 'https://api.brevo.com/v3';

const getBrevoHeaders = () => ({
  'api-key': process.env.BREVO_API_KEY,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

const getSdkErrorMessage = (error) =>
  error.response?.body?.message ||
  error.response?.data?.message ||
  error.body?.message ||
  error.message ||
  'Brevo request failed';

const getSdkErrorStatus = (error) =>
  error.response?.statusCode || error.response?.status || error.statusCode;

/**
 * Create a classic email campaign for Brevo-managed recipient lists.
 */
const createEmailCampaign = async ({
  name,
  subject,
  sender,
  htmlContent,
  listIds,
  scheduledAt,
  replyTo,
}) => {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

  const campaign = new SibApiV3Sdk.CreateEmailCampaign();
  campaign.name = name;
  campaign.subject = subject;
  campaign.sender = {
    name: sender?.name || process.env.BREVO_SENDER_NAME,
    email: sender?.email || process.env.BREVO_SENDER_EMAIL,
  };
  campaign.type = 'classic';
  campaign.htmlContent = htmlContent;
  campaign.recipients = { listIds };
  if (replyTo) campaign.replyTo = replyTo;
  if (scheduledAt) campaign.scheduledAt = scheduledAt;

  try {
    const apiInstance = new SibApiV3Sdk.EmailCampaignsApi();
    const data = await apiInstance.createEmailCampaign(campaign);
    return { success: true, data };
  } catch (error) {
    const status = getSdkErrorStatus(error);
    const message = getSdkErrorMessage(error);
    console.error(`[Brevo] Campaign error ${status || 'unknown'}: ${message}`);
    return { success: false, status, message };
  }
};

/**
 * Test Brevo API connection
 */
const testBrevoConnection = async () => {
  try {
    const response = await axios.get(`${BREVO_BASE_URL}/account`, {
      headers: getBrevoHeaders(),
      timeout: 10000,
    });
    return { success: true, data: response.data };
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    return { success: false, message: msg };
  }
};

/**
 * Send a single transactional email
 */
const sendTransactionalEmail = async ({
  sender,
  to,
  replyTo,
  subject,
  htmlContent,
  textContent,
  attachments = [],
  tags = [],
  params = {},
}) => {
  const payload = {
    sender: {
      name: sender?.name || process.env.BREVO_SENDER_NAME,
      email: sender?.email || process.env.BREVO_SENDER_EMAIL,
    },
    to: Array.isArray(to) ? to : [to],
    subject,
    htmlContent,
  };

  if (textContent) payload.textContent = textContent;
  if (replyTo) payload.replyTo = { email: replyTo };
  if (tags.length) payload.tags = tags;
  if (Object.keys(params).length) payload.params = params;

  // Brevo cannot fetch localhost URLs, so upload local files as inline content.
  if (attachments && attachments.length > 0) {
    try {
      payload.attachment = attachments.map((att) => {
        const filePath = att.storedName
          ? path.join(__dirname, '../../uploads/attachments', att.storedName)
          : null;

        if (filePath && fs.existsSync(filePath)) {
          return {
            content: fs.readFileSync(filePath).toString('base64'),
            name: att.originalName || att.name,
          };
        }

        if (att.url && /^https:\/\//i.test(att.url)) {
          return { url: att.url, name: att.originalName || att.name };
        }

        throw new Error(`Attachment file is unavailable: ${att.originalName || att.name || 'unknown file'}`);
      });
    } catch (error) {
      console.error(`[Brevo] Attachment error: ${error.message}`);
      return { success: false, status: 400, message: error.message, retryable: false };
    }
  }

  try {
    const response = await axios.post(`${BREVO_BASE_URL}/smtp/email`, payload, {
      headers: getBrevoHeaders(),
      timeout: 30000,
    });
    return { success: true, messageId: response.data.messageId, data: response.data };
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.message;
    
    console.error(`[Brevo] Send error ${status}: ${msg}`);
    
    return {
      success: false,
      status,
      message: msg,
      retryable: status === 429 || status >= 500,
    };
  }
};

/**
 * Send a test email
 */
const sendTestEmail = async ({ to, subject, htmlContent, sender }) => {
  return sendTransactionalEmail({
    sender,
    to: [{ email: to, name: 'Test Recipient' }],
    subject: `[TEST] ${subject}`,
    htmlContent: `
      <div style="background:#fff3cd;padding:12px;border-radius:6px;margin-bottom:20px;border:1px solid #ffc107;">
        <strong>⚠️ This is a TEST email</strong> — sent from Growthora Mail Rocket for preview purposes only.
      </div>
      ${htmlContent}
    `,
    tags: ['test'],
  });
};

/**
 * Get message events from Brevo (if available)
 */
const getMessageEvents = async (messageId) => {
  try {
    const response = await axios.get(`${BREVO_BASE_URL}/smtp/statistics/events`, {
      headers: getBrevoHeaders(),
      params: { messageId, limit: 10 },
      timeout: 10000,
    });
    return { success: true, events: response.data.events || [] };
  } catch (error) {
    return { success: false, events: [] };
  }
};

/**
 * Sleep utility for retry backoff
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send with exponential backoff retry
 */
const sendWithRetry = async (payload, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendTransactionalEmail(payload);
    if (result.success) return result;
    
    lastError = result;
    if (!result.retryable) break;
    
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`[Brevo] Retry ${attempt}/${maxRetries} in ${delay}ms...`);
      await sleep(delay);
    }
  }
  return lastError;
};

module.exports = {
  createEmailCampaign,
  testBrevoConnection,
  sendTransactionalEmail,
  sendTestEmail,
  sendWithRetry,
  getMessageEvents,
};
