import { NextResponse } from "next/server";
import { LANES } from "@/lib/lanes";
import type { SourceCategory } from "@/lib/types";
import { addUserSource, getAllSources, removeUserSource } from "@/lib/userSources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ sources: getAllSources() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string; category?: string } | null;
  const category = LANES.find((l) => l.id === body?.category)?.id as SourceCategory | undefined;
  if (!body?.url || !category) {
    return NextResponse.json({ ok: false, error: "请填写网址并选择分类。" }, { status: 400 });
  }
  const result = await addUserSource(body.url, category);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !(await removeUserSource(id))) {
    return NextResponse.json({ ok: false, error: "没找到这个来源。" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
