FROM node:20-slim

# ffmpeg: voice note mp3→m4a (LINE audio message รับเฉพาะ m4a)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "src/app.js"]
