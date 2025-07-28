FROM --platform=linux/amd64 node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY index.js ./

# For collection 1
# RUN mkdir -p /app/collection2/PDFs

# For collection 2
RUN mkdir -p /app/collection2/PDFs

# For collection 3
# RUN mkdir -p /app/collection3/PDFs

RUN chmod +x index.js

CMD ["npm", "start"]
