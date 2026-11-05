# ABALMA — nouvelle plateforme

Nouvelle version indépendante de la plateforme ABALMA. Le projet d’origine n’est pas modifié.

## Direction et parcours

- Recherche au premier plan par matériel et quartier, puis navigation par catégories.
- Interface pensée d’abord pour mobile, avec la même hiérarchie et des cartes adaptées sur ordinateur.
- Logo et palette ABALMA conservés; typographie remplacée par DM Sans.
- Les parcours de connexion, inscription, annonces, réservation et espace personnel sont conservés dans l’application.
- Le parcours reprend les repères utiles de Jiji (recherche, catégories, publication), sans reprendre son identité visuelle : [jiji.sn](https://jiji.sn/).

## Démarrage local

1. Installer Node.js 20 ou une version plus récente.
2. Copier `.env.example` vers `.env.local` et renseigner les clés publiques du nouveau projet Supabase.
3. Dans le SQL Editor de ce projet Supabase, exécuter `supabase/schema.sql`, puis `supabase/prelaunch-migration.sql`.
4. Dans Supabase → Authentication → Providers → Email, désactiver **Confirm email** pour que l’utilisateur accède à son compte juste après son inscription.
5. Lancer `npm install`, puis `npm run dev`.

La clé `anon` est publique et destinée à l’application web. Ne jamais mettre une clé `service_role` dans le site ou dans GitHub.

## Publication GitHub Pages

Le workflow `.github/workflows/pages.yml` construit et publie le site à chaque mise à jour de la branche principale. Dans le nouveau dépôt, ajouter les secrets du dépôt `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, puis activer GitHub Pages avec la source **GitHub Actions**. La base d’URL du site est automatiquement calculée à partir du nom du nouveau dépôt.

Dans Supabase → Authentication → URL Configuration, ajouter l’adresse de ce site et son chemin `/connexion` à la liste des URL autorisées.

## Avant ouverture publique

- Renseigner les coordonnées de l’exploitant aux emplacements marqués dans la page juridique.
- Remplacer toute annonce de démonstration par des annonces réelles consenties.
- Vérifier l’organisation, les paramètres de stockage des images et les règles de base de données du nouveau projet Supabase.
- La plateforme ne traite pas les paiements : les utilisateurs conviennent eux-mêmes du prix et de la remise.

## Variables

Voir `.env.example`. Aucune clé secrète n’est requise dans le navigateur.
