# Use the official NodeJS image.
# https://hub.docker.com/_/node
FROM node:16-slim

# Copy local code to the container image.
ENV APP_HOME /app
WORKDIR $APP_HOME
COPY . ./

# Install all (also dev to be able to build)
RUN npm install --only=production

# build the javascript
RUN npm run build

#  uninstall the dev dependencies
RUN npm prune --production

# Run the web service on container startup.
ENTRYPOINT [ "npm", "start" ]