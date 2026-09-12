FROM node:22-bookworm-slim

# FFmpeg é dependência de sistema do worker (thumbnail + transcode).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .

CMD ["npm", "run", "start"]
