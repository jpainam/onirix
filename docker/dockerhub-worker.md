# Onirix worker

Background worker for [Onirix](https://hub.docker.com/r/jpainam/onirix-app): document
indexing, connector syncs and their schedule. It also applies database
migrations when it starts.

This image is not meant to run alone. Install instructions, the compose file
and the `.env` template are on the
[`jpainam/onirix-app`](https://hub.docker.com/r/jpainam/onirix-app) page.

Tags match `jpainam/onirix-app`. Always run the same tag for both images.
