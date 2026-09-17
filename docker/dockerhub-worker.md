# Onirix worker

Background worker for [Onirix](https://hub.docker.com/r/jpainam/onirix-web): document
indexing, connector syncs and their schedule. It also applies database
migrations when it starts.

This image is not meant to run alone. Install instructions, the compose file
and the `.env` template are on the
[`jpainam/onirix-web`](https://hub.docker.com/r/jpainam/onirix-web) page.

Tags match `jpainam/onirix-web`. Always run the same tag for both images.
