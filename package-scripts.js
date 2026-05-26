const path = require("path");

const apiPath = path.resolve(__dirname, "apps/api");
const webPath = path.resolve(__dirname, "apps/web");
const todoPath = path.resolve(__dirname, "apps/todo");
const companyMapPath = path.resolve(__dirname, "apps/company-map");

const ciApiPath = path.resolve(__dirname, "out/apps/api");
const ciWebPath = path.resolve(__dirname, "out/apps/web");
const ciTodoPath = path.resolve(__dirname, "out/apps/todo");

module.exports = {
  scripts: {
    prepare: {
      default: `nps prepare.web prepare.api prepare.todo`,
      web: `yarn`,
      todo: `yarn`,
      api: `nps prepare.docker prisma.migrate.dev`,
      docker: "docker compose up -d",
      ci: {
        web: `npx turbo prune --scope=web && cd out && yarn install --frozen-lockfile`,
        api: `npx turbo prune --scope=api && cd out && yarn install --frozen-lockfile && nps prisma.generate`,
      },
    },
    test: {
      default: `nps test.web test.api test.todo`,
      web: `cd ${webPath} && yarn test`,
      api: `cd ${apiPath} && yarn test`,
      todo: `cd ${todoPath} && yarn test`,
      ci: {
        default: `nps test.ci.web test.ci.api test.ci.todo`,
        web: `cd ${ciWebPath} && yarn test:ci`,
        api: `cd ${ciApiPath} && yarn test:ci`,
        todo: `cd ${ciTodoPath} && yarn test:ci`,
      },
      watch: {
        default: `nps test.watch.web test.watch.api test.watch.todo`,
        web: `cd ${webPath} && yarn test:watch`,
        api: `cd ${apiPath} && yarn test:watch`,
        todo: `cd ${todoPath} && yarn test:watch`,
      },
    },
    prisma: {
      generate: {
        default: `nps prisma.generate.api prisma.generate.companyMap`,
        api: `cd ${apiPath} && npx prisma generate`,
        companyMap: `cd ${companyMapPath} && npx prisma generate`,
      },
      studio: `cd ${apiPath} && npx prisma studio`,
      migrate: {
        dev: `cd ${apiPath} && npx prisma migrate dev`,
      },
    },
    build: {
      default: "npx turbo run build",
      ci: {
        web: "cd out && npm run build",
        api: "cd out && npm run build",
      },
    },
    docker: {
      build: {
        default: "nps docker.build.web docker.build.api",
        web: `docker build -t web . -f ${webPath}/Dockerfile`,
        api: `docker build -t api . -f ${apiPath}/Dockerfile`,
      },
    },
    dev: "npx turbo run dev",
  },
};
