/* ================= cámara propia: la de atrás, dentro de la página ================= */
// Con <input capture="environment"> el móvil abre su app de Cámara, y la de Samsung ignora esa preferencia
// y se abre con la última cámara usada (la de delante). Aquí se abre la cámara desde la propia web, se pide
// la de atrás y, si el móvil da otra, se busca la de atrás por su nombre. Si no se puede (sin permiso o un
// navegador sin cámara), se cae al <input> de siempre.
let camAbierta = null;   // {stream, root}
const camPuede = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
function camCerrar(){
  if (!camAbierta) return;
  for (const t of camAbierta.stream ? camAbierta.stream.getTracks() : []) t.stop();
  camAbierta.root.remove(); camAbierta = null; document.body.style.overflow = "";
}
async function camStream(deviceId){
  const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } };
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { ...video, width: { ideal: 3840 }, height: { ideal: 2160 } } });
}
// Abre la cámara; cuando se hace la foto, llama a onFoto(file). Devuelve false si no se ha podido abrir.
async function abrirCamara(onFoto){
  if (!camPuede() || camAbierta) return false;
  const root = document.createElement("div");
  root.className = "cam";
  root.innerHTML = `<video playsinline autoplay muted></video>
    <div class="cam-msg">Encuadra el ticket entero</div>
    <div class="cam-bar"><button type="button" class="cam-btn" data-cam="x">Cancelar</button><button type="button" class="cam-shot" data-cam="foto" aria-label="Hacer la foto"></button><button type="button" class="cam-btn" data-cam="luz" hidden>Linterna</button></div>`;
  document.body.appendChild(root); document.body.style.overflow = "hidden";
  camAbierta = { root, stream: null };
  let stream;
  try {
    stream = await camStream();
    // si el móvil ha dado la de delante, se busca la de atrás por su nombre
    const s = stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings() : {};
    if (s.facingMode && s.facingMode !== "environment") {
      const atras = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind === "videoinput" && /back|rear|trasera|environment|0, facing back/i.test(d.label));
      if (atras) { for (const t of stream.getTracks()) t.stop(); stream = await camStream(atras.deviceId); }
    }
  } catch (e) {
    camCerrar();
    toast(e && e.name === "NotAllowedError" ? "Sin permiso para la cámara: dale permiso en el navegador o elige la foto de la galería." : "No he podido abrir la cámara: elige la foto de la galería.");
    return true;   // ya se ha avisado: no abrir además el selector
  }
  if (!camAbierta) { for (const t of stream.getTracks()) t.stop(); return true; }
  camAbierta.stream = stream;
  const video = root.querySelector("video"); video.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  let luz = false;
  const bLuz = root.querySelector('[data-cam="luz"]');
  if (caps.torch) bLuz.hidden = false;
  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-cam]"); if (!b) return;
    if (b.dataset.cam === "x") return camCerrar();
    if (b.dataset.cam === "luz") { luz = !luz; try { await track.applyConstraints({ advanced: [{ torch: luz }] }); b.setAttribute("aria-pressed", luz); } catch {} return; }
    if (b.dataset.cam === "foto") {
      b.disabled = true;
      let blob = null;
      try { if (window.ImageCapture) blob = await new ImageCapture(track).takePhoto(); } catch { blob = null; }   // la foto a resolución completa
      if (!blob) {
        const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
      }
      camCerrar();
      if (blob) onFoto(new File([blob], "ticket-" + Date.now() + ".jpg", { type: blob.type || "image/jpeg" }));
    }
  });
  return true;
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && camAbierta) camCerrar(); });
