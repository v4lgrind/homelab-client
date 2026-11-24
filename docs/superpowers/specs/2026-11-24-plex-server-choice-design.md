# Choix du serveur Plex + découverte rapide — design

## Intention
Le compte Plex de l'utilisateur voit deux serveurs : « v4lgrind » (le sien) et
« Serveur » (partagé). L'app prenait le premier de la liste par hasard, et la
connexion prenait environ 29 s. Elle testait toutes les adresses de tous les
serveurs et attendait la plus lente, alors que l'adresse locale répondait en 0,1 s.

Décision de l'utilisateur : **pouvoir choisir le serveur**, avec la maquette
`design-mockups/plex-server-picker.html` validée.

## Objectifs
- Après le code plex.tv/link, afficher la liste des serveurs : les siens d'abord,
  avec un badge « À toi » ou « Partagé ».
- S'il n'y a qu'un serveur, le choisir automatiquement.
- Ne tester que le serveur choisi, et s'arrêter dès qu'une adresse répond. Sur le
  réseau local ou par VPN, ça doit prendre moins d'une seconde.
- Mémoriser le choix. « Changer » rouvre la liste sans redemander de code.

## Hors périmètre
- Utiliser plusieurs serveurs Plex en même temps.

## Approches
- **Prendre automatiquement le premier serveur « à toi ».** Écartée : l'utilisateur
  veut choisir.
- **Retenue : une liste dans la carte Plex** (maquette validée).
- **Découverte en parallèle, puis attendre toutes les réponses** (l'existant).
  Remplacée par une attente **par niveau** : toutes les sondes partent en même
  temps, puis on prend la première adresse locale qui répond. Si aucune ne
  répond, on prend la première adresse publique, puis le relais. Choix de Claude :
  à la maison, la réponse est immédiate ; dehors, on attend au pire l'échec des
  adresses locales (environ 5 s).

## Design
- **`plex.ts`**
  - `listServers(accountToken)` appelle `/resources`, ne garde que les serveurs,
    et trie ceux de l'utilisateur en premier (`owned`).
  - `connectServer(resource, accountToken)` lance la sonde par niveau décrite
    plus haut, et renvoie un `PlexServer` ou une erreur « Serveur Plex injoignable
    depuis ce réseau ».
  - `discoverServers` est supprimé.
- **Store**
  - Le serveur choisi est enregistré dans `services.plex.serverId` (son
    `clientIdentifier`, persisté).
  - La liste proposée est gardée dans `plexChoices` (en mémoire seulement).
  - `selectPlexServer(id)`, puis `changePlexServer()`.
  - `discoverPlex` utilise `serverId` s'il est connu. Sinon, avec un seul serveur,
    il le prend ; avec plusieurs, il affiche la liste.
- **Interface** (`ServiceCard`)
  - La liste s'affiche quand `plexChoices` n'est pas vide : « Quel serveur
    utiliser ? », une ligne par serveur et « Annuler ».
  - Une fois connecté : « Serveur : **nom** », avec un lien « Changer ».
- **Badge** : si plex.tv n'envoie pas `owned`, le badge n'apparaît pas.
