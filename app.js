const OPERATIVES = {
  ORACLE: {
    asset: 'assets/briefings/oracle.njar',
    clearance: 'NIGHTJAR // VIP',
    assignment: 'Strategic command brief',
    filename: 'OPERATION_NIGHTJAR_VIP_BRIEF.pdf',
    overview: 'You are the protected VIP for a relaxed family birthday mission. Prepare for a mixed indoor and outdoor day, follow RAVEN’s movement cues, and communicate any comfort needs. Follow-on destinations remain compartmentalized.',
    directive: 'Review your VIP Movement & Readiness Brief below before departure.',
  },
  SENTINEL: {
    asset: 'assets/briefings/sentinel.njar',
    clearance: 'NIGHTJAR // FIELD',
    assignment: 'Tactical field brief',
    filename: 'OPERATION_NIGHTJAR.pdf',
    overview: 'You are the assistant mission lead. Protect the surprise, support SPARROW, monitor timing, document the operation, and help RAVEN keep the team on mission. ORACLE’s comfort takes priority.',
    directive: 'Read the complete Operation Order below before execution.',
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
const pdfViewer = document.querySelector('#pdf-viewer');
const openPdf = document.querySelector('#open-pdf');
const decrypting = document.querySelector('#decrypting');
let activeDocumentUrl = null;
let pdfJsPromise = null;

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
    await grantAccess(codename, operative, pdf);
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
  openPdf.removeAttribute('href');
  pdfViewer.replaceChildren();
  pdfViewer.hidden = true;
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

async function grantAccess(codename, operative, pdfBytes) {
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
  openPdf.href = activeDocumentUrl;
  pdfViewer.hidden = false;
  try {
    await renderPdf(pdfBytes);
    decrypting.hidden = true;
  } catch {
    decrypting.hidden = true;
    pdfViewer.innerHTML = '<p class="pdf-error">DOCUMENT RENDERER UNAVAILABLE.<br>USE “OPEN PDF” ABOVE TO VIEW THE BRIEF.</p>';
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function renderPdf(pdfBytes) {
  pdfViewer.replaceChildren();
  pdfJsPromise ??= import('./vendor/pdfjs/pdf.min.mjs');
  const pdfjs = await pdfJsPromise;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  const documentTask = pdfjs.getDocument({ data: pdfBytes.slice() });
  const pdf = await documentTask.promise;
  const availableWidth = Math.max(280, Math.min(pdfViewer.clientWidth - 16, 900));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const cssScale = availableWidth / baseViewport.width;
    const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(baseViewport.width * cssScale)}px`;
    canvas.style.height = `${Math.floor(baseViewport.height * cssScale)}px`;
    const figure = document.createElement('figure');
    figure.className = 'pdf-page';
    const caption = document.createElement('figcaption');
    caption.textContent = `PAGE ${pageNumber} // ${pdf.numPages}`;
    figure.append(canvas, caption);
    pdfViewer.append(figure);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise;
    page.cleanup();
  }
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
