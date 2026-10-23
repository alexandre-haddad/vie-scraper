const { chromium } = require("playwright");

const OFFERS_URL = "https://mon-vie-via.businessfrance.fr/offres";
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH; // optionnel

const CHECK_INTERVAL_MS = 30_000;
const PAGE_TIMEOUT_MS = 60_000;
const STARTUP_DELAY_MS = 3_000;

if (!WEBHOOK_URL) {
  console.error("Variable WEBHOOK_URL manquante (voir .env.example).");
  process.exit(1);
}

const seenLinks = new Set();
let isChecking = false;

process.on("unhandledRejection", err => {
  console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught exception:", err);
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox"]
  };
  if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

  const browser = await chromium.launchPersistentContext("./vie-profile", launchOptions);
  const page = await browser.newPage();

  console.log("Surveillance des offres VIE lancée en arrière-plan.");

  // Récupère les liens de toutes les offres visibles sur la page de listing
  async function getOfferLinks() {
    await page.goto(OFFERS_URL, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS
    });

    await wait(STARTUP_DELAY_MS);

    const offerLinks = await page.locator("a").evaluateAll(links =>
      links
        .map(a => a.href)
        .filter(href =>
          href &&
          href.includes("mon-vie-via.businessfrance.fr/offres/") &&
          !href.includes("/offres/recherche")
        )
    );

    return [...new Set(offerLinks)];
  }

  // Au démarrage, mémorise les offres existantes pour ne notifier que les nouvelles
  async function initializeSeenOffers() {
    try {
      const existingLinks = await getOfferLinks();
      existingLinks.forEach(link => seenLinks.add(link));

      console.log(`${existingLinks.length} offres existantes ignorées au démarrage.`);
      console.log("Surveillance active : seules les nouvelles offres déclencheront le webhook.");
    } catch (err) {
      console.error("Erreur d'initialisation :", err.message);
    }
  }

  // Envoie l'offre au scénario Make (analyse IA et alerte)
  async function sendWebhook(offerLink, missionText) {
    const payload = {
      source: "businessfrance",
      offerLink,
      missionText,
      detectedAt: new Date().toISOString()
    };

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook refusé : ${response.status} ${response.statusText}`);
    }
  }

  // Ouvre une nouvelle offre, extrait son texte et l'envoie
  async function processOffer(offerLink) {
    console.log("Nouvelle offre détectée :", offerLink);

    const offerPage = await browser.newPage();

    try {
      await offerPage.goto(offerLink, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT_MS
      });

      await wait(STARTUP_DELAY_MS);

      const missionText = await offerPage.locator("body").innerText();
      await sendWebhook(offerLink, missionText);

      console.log("Webhook envoyé :", offerLink);
    } catch (err) {
      console.error("Erreur sur l'offre :", offerLink, err.message);
    } finally {
      await offerPage.close().catch(() => {});
    }
  }

  // Cycle de vérification, protégé contre les exécutions concurrentes
  async function checkOffers() {
    if (isChecking) {
      console.log("Vérification déjà en cours, cycle ignoré.");
      return;
    }

    isChecking = true;

    try {
      const offerLinks = await getOfferLinks();

      for (const offerLink of offerLinks) {
        if (seenLinks.has(offerLink)) continue;
        seenLinks.add(offerLink);
        await processOffer(offerLink);
      }
    } catch (err) {
      console.error("Erreur surveillance offres :", err.message);
    } finally {
      isChecking = false;
    }
  }

  await initializeSeenOffers();
  setInterval(checkOffers, CHECK_INTERVAL_MS);
})();
