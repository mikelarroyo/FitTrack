FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (capa cacheada)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el resto del proyecto
COPY . .

# Directorio para la base de datos (se monta como volumen)
RUN mkdir -p db

EXPOSE 3000

CMD ["node", "server.js"]
