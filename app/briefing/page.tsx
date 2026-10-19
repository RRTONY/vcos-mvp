// Briefing Room - CEO Command Centre for the Monday/Thursday team meetings.
// The page is the self-contained handoff build (public/briefing-room.html);
// it reads and writes through /api/briefing via public/briefing-room-adapter.js.
// Framed so its own styling stays isolated from the rest of VCoS.
export const metadata = { title: "Briefing Room · VCoS" };

export default function BriefingRoomPage() {
  return (
    <iframe
      src="/briefing-room.html"
      title="Briefing Room"
      className="block w-full h-full border-0 bg-sand2"
    />
  );
}
