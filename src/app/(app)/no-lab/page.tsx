export default function NoLabPage() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mb-2 text-lg font-semibold text-slate-700">소속된 연구실이 없습니다</div>
        <p className="text-sm text-slate-500">
          연구실 PI 또는 학과관리자에게 초대를 요청하세요.
        </p>
      </div>
    </div>
  );
}
