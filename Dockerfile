# Use the latest Node.js runtime as a parent image
FROM node:24-alpine

# Enable Corepack so the pinned pnpm version from package.json is used
RUN corepack enable

# Set the working directory
WORKDIR /usr/src/app

# Copy the full workspace so workspace packages can be built during install
COPY . .

# Install dependencies and compile TypeScript across the workspace
RUN pnpm install --frozen-lockfile
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000

# Run the NestJS backend
ENTRYPOINT ["node", "apps/backend/dist/main.js"]
