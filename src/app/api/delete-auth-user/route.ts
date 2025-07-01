// // /app/api/delete-user.ts or /pages/api/delete-user.ts
// import { NextApiRequest, NextApiResponse } from "next";
// import { createClient } from "@supabase/supabase-js";

// const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key (important!)
// );

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   if (req.method === "POST") {
//     return res.status(405).json({ error: "Method not allowed" });
//   }

//   const { userId } = req.body;

//   if (!userId) {
//     return res.status(400).json({ error: "User ID is required" });
//   }

//   const { error } = await supabase.auth.admin.deleteUser(userId);

//   if (error) {
//     return res.status(500).json({ error: error.message });
//   }

//   return res.status(200).json({ success: true });
// }


// app/api/delete-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = body.userId;

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
