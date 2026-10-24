# Production Dockerfile for Your 2AM Friend Content Engine
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Copy application files
COPY server.js ./
COPY public ./public
COPY MASTER_PROMPT.md ./

# Create drafts folder
RUN mkdir -p drafts

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
