FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY setup-funnel.sh ./
RUN mkdir -p /data
ENV PORT=3098
ENV DATA_DIR=/data
EXPOSE 3098
CMD ["node", "server.js"]
