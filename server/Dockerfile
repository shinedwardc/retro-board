FROM node:22-slim
WORKDIR /app
# Dev deps are installed too: the app runs through tsx and migrations through node-pg-migrate
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
# Apply any pending migrations, then start the server
CMD ["sh", "-c", "npm run migrate && exec npm start"]
