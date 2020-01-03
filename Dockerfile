FROM node:lts as build
WORKDIR /app
ADD . /app
RUN yarn

FROM node:lts-slim
WORKDIR /app
COPY --from=build /app /app
CMD ["node", "/app/src/index.js"]
