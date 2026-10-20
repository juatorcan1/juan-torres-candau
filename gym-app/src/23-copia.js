/* ---------- copia de seguridad ----------
   «Copia» in the header downloads everything the app shows of both (sessions, weights, drinks, profiles,
   plans, chats and meals) in one JSON file. The database also keeps every earlier version
   of each document (gym_docs_historial), so this is the copy that lives outside Supabase. */
function downloadBackup(){
  if (dbState !== "ready") { toast("Espera a que carguen los datos"); return; }
  const out = { app: "Juan vs Ignacio", fecha: new Date().toISOString(), sesiones: real, pesajes: weights, bebidas: drinks,
    perfiles: Object.values(profiles), planes: Object.values(plans), chats: Object.values(chats), comidas: mealLog };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  a.download = `gimnasio-copia-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(`Copia descargada: ${real.length} sesiones`);
}
document.addEventListener("click", e => { if (e.target.closest("#backup")) downloadBackup(); });
