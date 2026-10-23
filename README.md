# vie-scraper

Scraper Playwright qui surveille en continu les offres de VIE (Volontariat International en Entreprise) publiées sur Business France, et transmet chaque nouvelle offre à un scénario Make pour analyse et alerte.

## Pourquoi

Les offres VIE intéressantes partent vite. Plutôt que de rafraîchir le site à la main, ce script détecte les nouvelles offres en quasi temps réel et les envoie automatiquement dans une chaîne d'automatisation.

## Fonctionnement

1. Au démarrage, le script charge la page des offres et mémorise celles déjà en ligne, pour ne notifier que les nouveautés.
2. Toutes les 30 secondes, il recharge la liste et compare les liens avec ceux déjà vus.
3. Pour chaque nouvelle offre, il ouvre la page, extrait le texte complet de la mission et l'envoie en JSON à un webhook Make.
4. Côté Make, un agent IA analyse l'offre (adéquation avec le profil, résumé) et déclenche une alerte.

Un verrou empêche deux cycles de tourner en même temps, et les erreurs sont isolées offre par offre pour que le service ne s'arrête jamais.

## Stack

Node.js, Playwright (Chromium headless), webhook Make, déploiement sur un VPS Hetzner.

## Installation

```bash
npm install
npx playwright install chromium
cp .env.example .env   # puis renseigner WEBHOOK_URL
npm start
```

Sur un serveur, le script peut être lancé en tâche de fond avec un gestionnaire de processus comme pm2 ou systemd.

## Format envoyé au webhook

```json
{
  "source": "businessfrance",
  "offerLink": "https://mon-vie-via.businessfrance.fr/offres/...",
  "missionText": "Texte complet de l'offre",
  "detectedAt": "2026-10-23T09:00:00.000Z"
}
```
