# to build a docker file with python and node.
# https://codepal.ai/dockerfile-writer.py/query/wrUIAqfT/dockerfile-python-nodejs
FROM python:3.10.12

# Set environment variables for configuration and to set defaults
ENV NODE_VERSION=20
 
# Install Node.js
RUN curl -sL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
RUN apt-get install -y nodejs

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