import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, subject, message } = body

    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "Name, email, subject, and message are required" },
        { status: 400 }
      )
    }

    const emailStr = String(email).trim().toLowerCase()
    if (!emailStr.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      )
    }

    await addDoc(collection(db, "contactMessages"), {
      name: String(name).trim(),
      email: emailStr,
      subject: String(subject).trim(),
      message: String(message).trim(),
      createdAt: new Date(),
      read: false,
    })

    return NextResponse.json({ success: true, message: "Message sent successfully" })
  } catch (error: any) {
    console.error("Error saving contact message:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send message" },
      { status: 500 }
    )
  }
}
