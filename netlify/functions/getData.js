// Conector: Netlify -> Apps Script -> Google Sheets
// No necesita Google Sheets API Key.

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbxCK28BbqN1MJkK8rpGwgSB90cooIr6ksgjFedFW4FTjl_KiAjDJXHd8Z2mJTzMWAEP/exec";

export async function handler() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "GET",
      redirect: "follow",
      headers: { "Accept": "application/json" },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Apps Script respondió ${res.status}: ${text.slice(0, 300)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Apps Script no devolvió JSON válido.");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "No se pudo conectar con Apps Script.",
        detail: err?.message || String(err),
      }),
    };
  }
}
