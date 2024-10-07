FROM node:lts

WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of your app's source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

EXPOSE 8080

CMD [ "node", "dist/server.js" ]