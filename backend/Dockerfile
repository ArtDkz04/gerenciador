# backend/Dockerfile

# Use uma imagem base do Node.js leve e segura
FROM node:18-alpine

# Instala o cliente do postgres (necessário para o comando pg_dump funcionar)
RUN apk add --no-cache postgresql-client

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos de definição de pacotes
COPY package*.json ./

# Instala as dependências da aplicação
RUN npm install

# Copia todos os outros arquivos da aplicação (incluindo server.js e create-admin.js)
COPY . .

# Expõe a porta que a aplicação vai rodar
EXPOSE 3000

# Comando para iniciar a aplicação quando o contêiner iniciar
CMD [ "node", "server.js" ]