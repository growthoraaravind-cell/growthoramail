const Template = require('../models/Template');

const getTemplates = async (req, res, next) => {
  try {
    const templates = await Template.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { templates } });
  } catch (error) { next(error); }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, subject, htmlContent, textContent, footer } = req.body;
    if (!name || !subject || !htmlContent) {
      return res.status(400).json({ success: false, message: 'Name, subject and content are required' });
    }
    const template = await Template.create({ name, subject, htmlContent, textContent, footer, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Template created', data: { template } });
  } catch (error) { next(error); }
};

const updateTemplate = async (req, res, next) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      req.body, { returnDocument: 'after' }
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template updated', data: { template } });
  } catch (error) { next(error); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const template = await Template.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) { next(error); }
};

const duplicateTemplate = async (req, res, next) => {
  try {
    const original = await Template.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!original) return res.status(404).json({ success: false, message: 'Template not found' });
    const copy = await Template.create({
      name: `${original.name} (Copy)`,
      subject: original.subject,
      htmlContent: original.htmlContent,
      textContent: original.textContent,
      footer: original.footer,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, message: 'Template duplicated', data: { template: copy } });
  } catch (error) { next(error); }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate };
