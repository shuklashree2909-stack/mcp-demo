# 1. Base image
FROM node:20-alpine AS builder

# 2. Set working directory
WORKDIR /app

# 3. Copy package files
COPY package*.json ./

# 4. Install ALL dependencies (including TypeScript)
RUN npm install

# 5. Copy entire project
COPY . .

# 6. Build TypeScript -> JavaScript
RUN npm run build

# -------------------------
# Second stage: production
# -------------------------
FROM node:20-alpine

WORKDIR /app

# Copy only package files first
COPY package*.json ./

# Install ONLY production dependencies
RUN npm install --only=production

# Copy compiled JS output from builder
COPY --from=builder /app/build ./build

# Expose port (change if needed)
EXPOSE 3000

# Start your app
CMD ["npm", "start"]
