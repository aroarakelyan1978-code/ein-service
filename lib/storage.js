const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const applicationsFile = path.join(dataDir, 'applications.json');
const draftsFile = path.join(dataDir, 'drafts.json');
const emailLogFile = path.join(dataDir, 'email-log.json');

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensureFile(filePath, fallbackValue) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
  }
}

function readJson(filePath, fallbackValue) {
  ensureFile(filePath, fallbackValue);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  ensureDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

function listApplications() {
  const applications = readJson(applicationsFile, []);
  return applications.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getApplicationById(id) {
  return listApplications().find((application) => application.id === id) || null;
}

function getApplicationByTrackingCode(trackingCode) {
  return listApplications().find((application) => application.trackingCode === trackingCode) || null;
}

function saveApplication(application) {
  const applications = listApplications();
  applications.push(application);
  writeJson(applicationsFile, applications);
  return application;
}

function updateApplication(id, updater) {
  const applications = listApplications();
  const index = applications.findIndex((application) => application.id === id);
  if (index === -1) return null;

  const current = applications[index];
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  applications[index] = {
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  };

  writeJson(applicationsFile, applications);
  return applications[index];
}

function listDrafts() {
  return readJson(draftsFile, {});
}

function getDraft(draftId) {
  const drafts = listDrafts();
  return drafts[draftId] || null;
}

function saveDraft(draftId, payload) {
  const drafts = listDrafts();
  drafts[draftId] = {
    draftId,
    updatedAt: new Date().toISOString(),
    payload,
  };
  writeJson(draftsFile, drafts);
  return drafts[draftId];
}

function deleteDraft(draftId) {
  const drafts = listDrafts();
  if (!drafts[draftId]) return;
  delete drafts[draftId];
  writeJson(draftsFile, drafts);
}

function appendEmailLog(entry) {
  const emailLog = readJson(emailLogFile, []);
  emailLog.push({
    ...entry,
    loggedAt: new Date().toISOString(),
  });
  writeJson(emailLogFile, emailLog);
}

module.exports = {
  listApplications,
  getApplicationById,
  getApplicationByTrackingCode,
  saveApplication,
  updateApplication,
  getDraft,
  saveDraft,
  deleteDraft,
  appendEmailLog,
};
