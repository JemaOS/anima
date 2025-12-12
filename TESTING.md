# Guide de Tests - Anima

Ce projet contient une suite de tests complète pour assurer la qualité avant la mise en production.

## 1. Tests Unitaires & Intégration

Nous utilisons **Vitest** et **React Testing Library**.

### Structure
- `src/tests/unit`: Tests de fonctions isolées (helpers, utils).
- `src/tests/integration`: Tests de composants React.

### Lancer les tests
```bash
# Lancer tous les tests unitaires et d'intégration
pnpm test

# Lancer en mode UI (interface graphique)
pnpm test:ui

# Lancer une seule fois (pour CI)
pnpm test:run
```

## 2. Tests E2E (End-to-End)

Nous utilisons **Playwright** pour simuler des scénarios utilisateurs réels.

### Structure
- `src/tests/e2e`: Scénarios complets (navigation, création de salle, etc.).

### Lancer les tests
```bash
# Installer les navigateurs (première fois)
npx playwright install

# Lancer les tests E2E
pnpm test:e2e

# Voir le rapport
npx playwright show-report
```

## 3. Tests de Performance

Pour les tests de charge, nous recommandons **k6**.

### Exemple de script k6 (load_test.js)
```javascript
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  http.get('http://localhost:5173');
  sleep(1);
}
```
*Note: Installez k6 séparément pour exécuter ce test.*

## 4. Tests de Sécurité

### Audit des dépendances
Vérifiez les vulnérabilités connues dans les paquets npm.
```bash
npm audit
# ou
pnpm audit
```

### Autres outils recommandés
- **OWASP ZAP**: Pour scanner les vulnérabilités web.
- **Snyk**: Pour une analyse plus poussée des dépendances et du code.

## 5. Tests d'API

Si le backend évolue, utilisez des outils comme **Postman** ou **Supertest** pour valider les endpoints API indépendamment du frontend.

## 6. Tests de Régression

Avant chaque déploiement en production :
1. Lancer `pnpm test:run` (Unit + Integration)
2. Lancer `pnpm test:e2e` (E2E)
3. Vérifier `pnpm audit` (Sécurité)
4. Vérifier que le build passe : `pnpm build`

---
**Dossier de tests créé à :** `src/tests/`
