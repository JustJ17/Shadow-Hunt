"use client";

/**
 * Game rules content — shared between the /rules page and in-game popup.
 */
export function RulesContent() {
  return (
    <div className="space-y-6 text-gray-200 text-sm leading-relaxed">
      <section>
        <h2 className="text-xl font-bold text-white mb-2">Overview</h2>
        <p>
          Shadow Hunt is a turn-based deduction game for 2–4 players. A hidden Main Threat
          is located somewhere on the world map. Players travel between cities, gather clues,
          and race to be the first to correctly identify and capture the Main Threat.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">The Map</h2>
        <p>
          The world is divided into 6 regions: Europe, Asia, Africa, North America,
          South America, and Oceania. Each region has a hub city and several other cities
          connected by routes (car, boat, or plane).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">Turn Structure</h2>
        <p>
          Players take turns in fixed order. Each turn you get <strong>2 actions</strong>.
          On each action you can:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-300">
          <li><strong>Move</strong> — Travel to a connected city via car, boat, or plane.</li>
          <li><strong>Skip</strong> — Pass your action (do nothing).</li>
          <li><strong>Capture Attempt</strong> — Declare the Main Threat is at your location. Correct = you win! Incorrect = turn ends.</li>
          <li><strong>Use Card</strong> — Play an Action Card from your hand for a special effect.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">Clues &amp; Notebook</h2>
        <p>
          Clue cards reveal information about the Main Threat's location. When you play a
          clue card, the result appears in your private Notebook at the end of your turn.
          Each turn (including extra turns) delivers clues independently.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-300">
          <li><strong>Locate the Mastermind</strong> — Shows the distance (in steps) from your position to the Main Threat.</li>
          <li><strong>Bug-a-Phone</strong> — Intercepts intel from a random other player: their distance to the threat and spy info in their region.</li>
          <li><strong>Reveal Direction</strong> — Points toward an adjacent city that is one step closer to the Main Threat.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">Spies &amp; Action Cards</h2>
        <p>
          Each region has a hidden Spy NPC. When you land on a Spy's city, you can confront
          it to earn an Action Card. Cards provide powerful one-time abilities:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-300">
          <li><strong>Extra Turn</strong> — Get an additional full turn after your current one.</li>
          <li><strong>Blockade</strong> — Block a transport type (car/boat/plane) for other players temporarily.</li>
          <li><strong>Skip Agent</strong> — Force another player to skip their next turn.</li>
          <li><strong>Clue Cards</strong> — Various intelligence-gathering abilities (see above).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">Winning &amp; Losing</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li><strong>Win:</strong> Be at the Main Threat's city and use Capture Attempt — if correct, you win immediately.</li>
          <li><strong>Draw:</strong> If no one captures the Main Threat within the round limit, the game ends in a draw.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-2">Tips</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>Use clue cards from different locations to triangulate the Main Threat's position.</li>
          <li>Confront spies early to get cards that give you an edge.</li>
          <li>Watch the Event Feed — other players' movements can give away their deductions.</li>
          <li>Don't capture attempt too early — an incorrect guess wastes your turn.</li>
        </ul>
      </section>
    </div>
  );
}