FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs profiles.mjs activate-profile.mjs ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
ENV NODE_ENV=production PORT=4320 HOST=0.0.0.0
USER node
EXPOSE 4320
CMD ["node", "server.mjs"]
