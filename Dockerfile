# Use the official NodeJS image.
# https://hub.docker.com/_/node
FROM node:16-slim

# install python
RUN apt install python3

# Copy local code to the container image.
WORKDIR collector-web-app

COPY ./vectorizer.py ./vectorizer.py
COPY ./requirement.txt ./requirement.txt

# install requirements
RUN python -m pip install -r requirement.txt


# copy only usefull stuff
COPY ./out ./out
COPY ./static ./static
COPY ./views ./views
COPY ./package-lock.json ./package-lock.json
COPY ./package.json ./package.json

RUN npm install --omit=dev

# Run the web service on container startup.
ENTRYPOINT [ "npm", "start" ]