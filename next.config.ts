import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // contextbio.ai/labis 경로 서빙에 맞춘 기본 경로.
  // 로컬/오리진 접근도 동일하게 /labis 하위로 온다 (예: https://c1.sysmed.kr/labis).
  // dev 서버는 NEXT_BASE_PATH=/labis-dev 로 운영과 경로를 분리한다 (Apache /labis-dev → :3101).
  basePath: process.env.NEXT_BASE_PATH || "/labis",
  // 단일 디렉터리 dev/main 운영: dev 서버(.next-dev)가 운영 빌드(.next)를 덮어쓰지 않게 분리.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
