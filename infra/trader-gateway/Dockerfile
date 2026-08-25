FROM node:24-alpine
WORKDIR /app
COPY server.mjs /app/server.mjs
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "/app/server.mjs"]
