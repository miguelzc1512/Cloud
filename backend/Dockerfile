FROM node:20-alpine

# Instalar dependencias nativas para sharp y mejor-sqlite3
RUN apk add --no-cache python3 make g++ vips-dev vips-heif sqlite-dev bash

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "run", "dev"]
