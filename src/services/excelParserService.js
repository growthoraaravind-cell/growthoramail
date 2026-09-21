const XLSX = require('xlsx');
const path = require('path');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize column headers
 */
const normalizeHeader = (header) => {
  const str = String(header || '').toLowerCase().trim().replace(/[-_\s]/g, '');
  if (['name', 'fullname', 'firstname', 'contactname'].includes(str)) return 'name';
  if (['email', 'emailaddress', 'email_address', 'mail', 'e-mail', 'email-address'].includes(str)) return 'email';
  return str;
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
};

/**
 * Normalize email address
 */
const normalizeEmail = (email) => {
  return String(email || '').toLowerCase().trim();
};

/**
 * Parse Excel or CSV file and return contacts
 */
const parseExcelFile = (filePath, maxContacts) => {
  const MAX = maxContacts || parseInt(process.env.MAX_BATCH_CONTACTS) || 280;

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellText: false, cellDates: true });
  } catch (err) {
    throw new Error('Failed to read file. Please ensure it is a valid Excel or CSV file.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in the file.');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('File is empty or has no data rows.');
  }

  // Find header row
  const headerRow = rawRows[0];
  const normalizedHeaders = headerRow.map(normalizeHeader);

  const nameIndex = normalizedHeaders.indexOf('name');
  const emailIndex = normalizedHeaders.indexOf('email');

  if (emailIndex === -1) {
    throw new Error('Could not find an "Email" column. Please ensure your file has an Email column.');
  }

  const dataRows = rawRows.slice(1);

  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seenEmails = new Set();

  for (const row of dataRows) {
    // Skip completely empty rows
    if (!row || row.every(cell => !cell)) continue;

    const emailRaw = String(row[emailIndex] || '').trim();
    const name = nameIndex !== -1 ? String(row[nameIndex] || '').trim() : '';

    if (!emailRaw) {
      invalid.push({ name, email: '', reason: 'Empty email' });
      continue;
    }

    const normalizedEmailVal = normalizeEmail(emailRaw);

    if (!isValidEmail(emailRaw)) {
      invalid.push({ name, email: emailRaw, reason: 'Invalid email format' });
      continue;
    }

    if (seenEmails.has(normalizedEmailVal)) {
      duplicates.push({ name, email: emailRaw, reason: 'Duplicate email' });
      continue;
    }

    seenEmails.add(normalizedEmailVal);
    valid.push({ name, email: emailRaw, normalizedEmail: normalizedEmailVal });
  }

  const limitReached = valid.length > MAX;
  const imported = valid.slice(0, MAX);
  const skipped = valid.slice(MAX);

  return {
    imported,
    invalid,
    duplicates,
    skipped,
    totalRows: dataRows.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    duplicateCount: duplicates.length,
    importedCount: imported.length,
    skippedCount: skipped.length,
    limitReached,
    maxContacts: MAX,
  };
};

module.exports = { parseExcelFile, isValidEmail, normalizeEmail };
