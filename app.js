const OPERATIVES = {
  ORACLE: {
    asset: 'assets/briefings/oracle.njar',
    clearance: 'NIGHTJAR // VIP',
    assignment: 'Strategic command brief',
    filename: 'OPERATION_NIGHTJAR_VIP_BRIEF.pdf',
    overview: 'You are the protected VIP for Operation NIGHTJAR, a relaxed family birthday mission beginning at Home Base and the known morning objective at Hooksett Old Home Day. RAVEN and SENTINEL will manage navigation, timing, and all undisclosed follow-on objectives. Your task is to prepare for a mixed indoor and outdoor family day, communicate comfort needs, and follow movement cues.',
    directive: 'Review the VIP Movement & Readiness Brief below before departure. It contains every time, preparation item, and instruction you are cleared to receive.',
  },
  SENTINEL: {
    asset: 'assets/briefings/sentinel.njar',
    clearance: 'NIGHTJAR // FIELD',
    assignment: 'Tactical field brief',
    filename: 'OPERATION_NIGHTJAR.pdf',
    overview: 'You are the senior field operator and assistant mission lead for a concealed birthday operation on 19 September 2026. Support RAVEN by protecting surprise integrity, assisting SPARROW, monitoring hard time anchors, documenting the mission, and flagging timing or morale concerns. Flexibility and ORACLE comfort take priority throughout execution.',
    directive: 'Read the complete Operation Order below before execution. You are responsible for knowing the objectives, movement timeline, contingencies, and mission-success criteria.',
  },
};

const loginView = document.querySelector('#login-view');
const briefingView = document.querySelector('#briefing-view');
const form = document.querySelector('#login-form');
const codenameInput = document.querySelector('#codename');
const passcodeInput = document.querySelector('#passcode');
const togglePasscode = document.querySelector('#toggle-passcode');
const errorBox = document.querySelector('#auth-error');
const submitButton = document.querySelector('#submit-button');
const logoutButton = document.querySelector('#logout-button');
const documentFrame = document.querySelector('#document-frame');
const decrypting = document.querySelector('#decrypting');
let activeDocumentUrl = null;

codenameInput.addEventListener('input', () => {
  codenameInput.value = codenameInput.value.toUpperCase();
  errorBox.hidden = true;
});

passcodeInput.addEventListener('input', () => { errorBox.hidden = true; });

togglePasscode.addEventListener('click', () => {
  const showing = passcodeInput.type === 'text';
  passcodeInput.type = showing ? 'password' : 'text';
  togglePasscode.textContent = showing ? 'SHOW' : 'HIDE';
  togglePasscode.setAttribute('aria-label', showing ? 'Show passcode' : 'Hide passcode');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const codename = codenameInput.value.trim().toUpperCase();
  const operative = OPERATIVES[codename];
  if (!operative || !passcodeInput.value) return denyAccess();

  submitButton.disabled = true;
  submitButton.textContent = 'VERIFYING...';
  try {
    const pdf = await decryptBriefing(operative.asset, passcodeInput.value);
    grantAccess(codename, operative, pdf);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
    denyAccess();
  } finally {
    passcodeInput.value = '';
    submitButton.disabled = false;
    submitButton.textContent = 'REQUEST CLEARANCE';
  }
});

logoutButton.addEventListener('click', () => {
  if (activeDocumentUrl) URL.revokeObjectURL(activeDocumentUrl);
  activeDocumentUrl = null;
  documentFrame.removeAttribute('src');
  documentFrame.hidden = true;
  decrypting.hidden = false;
  briefingView.hidden = true;
  logoutButton.hidden = true;
  loginView.hidden = false;
  codenameInput.value = '';
  errorBox.hidden = true;
  codenameInput.focus();
});

function denyAccess() {
  errorBox.hidden = false;
  passcodeInput.value = '';
  passcodeInput.focus();
}

function grantAccess(codename, operative, pdfBytes) {
  document.querySelector('#operative-name').textContent = codename;
  document.querySelector('#clearance-label').textContent = `ACCESS GRANTED // ${operative.clearance}`;
  document.querySelector('#clearance-band').textContent = operative.clearance;
  document.querySelector('#assignment').textContent = operative.assignment;
  document.querySelector('#document-name').textContent = operative.filename;
  document.querySelector('#mission-overview').textContent = operative.overview;
  document.querySelector('#read-directive').textContent = operative.directive;
  loginView.hidden = true;
  briefingView.hidden = false;
  logoutButton.hidden = false;
  activeDocumentUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
  documentFrame.src = `${activeDocumentUrl}#toolbar=0&navpanes=0&view=FitH`;
  documentFrame.onload = () => {
    decrypting.hidden = true;
    documentFrame.hidden = false;
  };
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function decryptBriefing(assetUrl, passcode) {
  const response = await fetch(assetUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Package unavailable');
  const packageBytes = new Uint8Array(await response.arrayBuffer());
  const magic = new TextDecoder().decode(packageBytes.slice(0, 5));
  if (magic !== 'NJAR1') throw new Error('Invalid package');
  const salt = packageBytes.slice(5, 21);
  const iv = packageBytes.slice(21, 33);
  const encrypted = packageBytes.slice(33);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  const bytes = new Uint8Array(decrypted);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Invalid briefing');
  return bytes;
}
