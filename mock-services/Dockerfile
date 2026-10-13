FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY package.json server.js ./
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
