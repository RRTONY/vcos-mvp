// Leadership reference card - adapted from Matt Mochary's operating system
// (mocharymethod.com) for the RampRate A-Team. Static reference content only;
// the actual weekly-report questions that implement these laws live in
// app/submit/page.tsx.

const LAWS = [
  {
    num: "1",
    tag: "The Agreement Law",
    title: "Agreements, Not Assignments",
    body: "Never tell someone what to do. Get them to say out loud what they will do and by when. Repeat it back to them. Put it in writing. That is now their agreement, not your reminder. When it is not done, you are not nagging - you are holding them to their own word.",
    exampleLabel: "Instead of saying → say this",
    example:
      '"Can you get me the investor list by Friday?" → "What date do you think is realistic to have the investor list to me? Great - so that\'s your commitment for Thursday at 5pm. I\'ll send a calendar invite now."',
  },
  {
    num: "2",
    tag: "The Ownership Law",
    title: "One Owner. One Date. Every Time.",
    body: 'Every task in the system - ClickUp, a meeting note, a Slack thread - must have exactly one human name and one specific date attached to it. Not "team." Not "soon." Not "pending." If it has neither, it does not exist as a real task. It is a wish.',
    exampleLabel: "The Monday audit rule",
    example:
      'If you cannot answer "who is accountable, and what date did they agree to?" for any task - that task has no power. Fix it before the meeting starts or remove it from the board entirely.',
  },
  {
    num: "3",
    tag: "The Meeting Law",
    title: "Meetings Are for Decisions. Not Status.",
    body: "Every team member submits a written update before any meeting begins. The meeting opens with wins only - 60 seconds per person on what they closed. Then blocked items. Then decisions. No one reads a status report aloud in the room.",
    exampleLabel: "The meeting sequence",
    example:
      "Written updates due Monday 9am → Wins round (60s each) → Blocked items only → Owner + new date for each block → Decisions made → Summary sent within 30 minutes.",
  },
  {
    num: "4",
    tag: "The Escalation Law",
    title: "Protect the Principal's Time",
    body: "Issues resolvable at the team level never reach leadership. Issues that do arrive pre-packaged: here is the problem, here are three options, here is what we recommend. Leadership says yes or no in under 90 seconds.",
    exampleLabel: "The escalation format",
    example:
      "Problem (one sentence) → Option A → Option B → Option C → We recommend Option B because [reason]. What is your call?",
  },
  {
    num: "5",
    tag: "The Confrontation Law",
    title: "Broken Agreements Get a Call, Not a Message",
    body: "When an agreement is broken, do not send a Slack message. Call. Lead with curiosity, not accusation. Then be quiet. Let them explain. Get a new date. Confirm it in writing. Move on. No drama, no shame, no threat - just a new agreement.",
    exampleLabel: "The broken-agreement script",
    example:
      '"Hey - [task] was due [date]. I know things come up. What happened?" [pause] "Okay. What\'s a new date you can commit to?" [confirm in writing within 60 seconds]',
  },
];

const MATRIX = [
  {
    stop: "Sending a reminder into the void",
    work: "A phone call to their mobile",
  },
  {
    stop: "Telling people what to do",
    work: "Asking them what they'll commit to",
  },
  {
    stop: "Status meetings where people read updates",
    work: "Written updates before the meeting, decisions inside it",
  },
  {
    stop: "Bringing leadership a problem",
    work: "Bringing three options and a recommendation",
  },
];

const LOOP_STEPS = [
  {
    title: "Surface the Task",
    body: "Identify the open loop. Know exactly what is needed and why it matters.",
  },
  {
    title: "Get the Agreement",
    body: "Ask them what date they will commit to. Not your date - their date.",
  },
  {
    title: "Confirm in Writing",
    body: "Calendar invite within 60 seconds. Task name, link, one-line context.",
  },
  {
    title: "Follow on the Date",
    body: "If done - close and celebrate publicly. If not - call. Curiosity first, new date.",
  },
  {
    title: "Report the Win",
    body: "A few lines up the chain: done, who, what it unlocks. Nothing more needed.",
  },
];

const QUESTIONS = [
  {
    q: "Why isn't this done yet?",
    a: "Genuine curiosity, not accusation. The answer tells you whether this is a skill, resource, priority, or clarity problem - each needs a different response.",
  },
  {
    q: "What is the cost of one more week of inaction?",
    a: "Make the stakes visible as context, not pressure. When people see what a blocked task costs, urgency becomes shared rather than imposed.",
  },
  {
    q: "What do you need from me to get unstuck?",
    a: "This is the question that separates managers from leaders - it signals you're a collaborator, not a monitor.",
  },
  {
    q: "What date can you commit to - specifically?",
    a: '"Soon" is not a date. Always end the conversation with a specific date and hour, or it didn\'t produce an agreement.',
  },
  {
    q: "How can I make this easier for you?",
    a: "The offer that builds the favor bank - the moment you become the person who makes people successful at their jobs.",
  },
  {
    q: "What went well this week that deserves recognition?",
    a: "Culture is built one public acknowledgment at a time.",
  },
];

export default function MocharyMethodPage() {
  return (
    <div className="pb-10">
      <h1 className="font-display text-xl tracking-widest mt-6 mb-1">
        THE MOCHARY METHOD
      </h1>
      <p className="text-xs text-ink4 mb-4">
        The operating system used by CEOs across the industry - adapted for how
        this team communicates, leads, and turns intention into action every
        week. The weekly report&apos;s questions (see{" "}
        <span className="font-semibold text-ink3">Weekly Report</span>)
        implement these laws directly.
      </p>

      <div className="alert alert-blue text-base font-semibold leading-relaxed mb-6">
        People honor their own agreements. They ignore other people&apos;s
        assignments. Your entire job is to turn every task into an agreement the
        other person made with themselves.
      </div>

      <div className="slbl">Five Laws of Mochary Communication</div>
      {LAWS.map((law) => (
        <div key={law.num} className="card">
          <div className="card-hd">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-display text-ink4 leading-none">
                {law.num}
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  {law.tag}
                </div>
                <div className="card-ti text-base">{law.title}</div>
              </div>
            </div>
          </div>
          <div className="card-body space-y-3">
            <p className="text-sm text-ink2 leading-relaxed">{law.body}</p>
            <div className="bg-accent-light border-l-4 border-accent px-4 py-3 rounded">
              <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">
                {law.exampleLabel}
              </div>
              <p className="text-sm text-ink2 leading-relaxed">{law.example}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="slbl">
        What Works vs. What Wastes Everyone&apos;s Time
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {MATRIX.map((row, i) => (
          <div key={i} className="contents">
            <div className="card mb-0">
              <div className="card-body">
                <span className="badge-red mb-2 inline-block">
                  Stops Working
                </span>
                <p className="text-sm text-ink2 leading-relaxed">{row.stop}</p>
              </div>
            </div>
            <div className="card mb-0">
              <div className="card-body">
                <span className="badge-green mb-2 inline-block">
                  What Works
                </span>
                <p className="text-sm text-ink2 leading-relaxed">{row.work}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="slbl">
        The Agreement Loop - Every Task Follows This Path
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {LOOP_STEPS.map((step, i) => (
          <div
            key={step.title}
            className={`flex-1 rounded-lg border p-4 ${i === 2 ? "bg-accent text-white border-accent" : "card mb-0"}`}
          >
            <div
              className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${i === 2 ? "text-white/70" : "text-accent"}`}
            >
              Step 0{i + 1}
            </div>
            <div
              className={`font-display text-sm tracking-wide mb-1 ${i === 2 ? "text-white" : "text-ink"}`}
            >
              {step.title}
            </div>
            <p
              className={`text-xs leading-relaxed ${i === 2 ? "text-white/85" : "text-ink3"}`}
            >
              {step.body}
            </p>
          </div>
        ))}
      </div>

      <div className="slbl">Ask These Before Every Escalation, Every Week</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {QUESTIONS.map((item) => (
          <div key={item.q} className="card mb-0">
            <div className="card-body">
              <div className="font-display text-sm tracking-wide text-accent mb-2">
                {item.q}
              </div>
              <p className="text-sm text-ink2 leading-relaxed">{item.a}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="alert alert-blue text-base font-semibold leading-relaxed">
        Claude is the infrastructure. You are the culture. The most powerful
        person on any lean team is not the one who catches people failing - it
        is the one who makes success feel inevitable.
      </div>

      <p className="text-xs text-ink4 mt-4">
        Based on the work of Matt Mochary · mocharymethod.com. Adapted for
        RampRate A-Team.
      </p>
    </div>
  );
}
