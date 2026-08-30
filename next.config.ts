import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // contextbio.ai/labis 경로 서빙에 맞춘 기본 경로.
  // 로컬/오리진 접근도 동일하게 /labis 하위로 온다 (예: https://c1.sysmed.kr/labis).
  basePath: "/labis",
};

export default nextConfig;
