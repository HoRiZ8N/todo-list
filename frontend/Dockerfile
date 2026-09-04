FROM node:20-alpine AS build
WORKDIR /src
COPY package.json tsconfig.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /src/index.html /usr/share/nginx/html/index.html
COPY --from=build /src/styles /usr/share/nginx/html/styles
COPY --from=build /src/dist /usr/share/nginx/html/dist
EXPOSE 80
