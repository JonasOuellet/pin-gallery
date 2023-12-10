# Use the official NodeJS image.
# https://hub.docker.com/_/node
FROM node:16-slim

# Copy local code to the container image.
WORKDIR collector-web-app

# copy only usefull stuff
COPY ./out ./out
COPY ./static ./static
COPY ./views ./views
COPY ./package-lock.json ./package-lock.json
COPY ./package.json ./package.json

RUN npm install --omit=dev

# Run the web service on container startup.
ENTRYPOINT [ "npm", "start" ]