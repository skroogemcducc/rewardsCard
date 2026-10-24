export const coffeeJokes = [
  'Espresso yourself. You are doing brew-tifully.',
  'Keep going. Your mug is counting on you.',
  'Bean there, sipped that, earned the reward.',
  'You mocha us very proud, Patrick.',
  'Stay grounded. Unless someone offers cold brew.',
  'A latte progress is still progress.',
  'Sip happens. Coffee helps.',
  'You are one cup closer to peak caffeination.'
];

const esc = value => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

function progressMarkup(view) {
  return Array.from({ length: 8 }, (_, index) =>
    `<span class="${index < view.drinkCredits ? 'filled' : ''}">${index < view.drinkCredits ? '✓' : index + 1}</span>`
  ).join('');
}

function tabsMarkup(view, activeTab) {
  return `<div class="tabs" role="tablist" aria-label="Patrick's rewards card">
    <button class="tab ${activeTab === 'tally' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'tally'}" data-tab="tally">Drink tally</button>
    <button class="tab ${activeTab === 'rewards' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'rewards'}" data-tab="rewards">Rewards <span class="tab-count">${view.availableRewards.length}</span></button>
  </div>`;
}

function tallyMarkup(view, jokeIndex) {
  const joke = coffeeJokes[jokeIndex % coffeeJokes.length];
  return `<section class="tab-panel" role="tabpanel">
    <div class="tally center lifetime"><div class="eyebrow">Lifetime drinks</div><h1>${view.lifetimeDrinkCredits}</h1><p>Every paid drink, counted forever.</p></div>
    <div class="next-reward center"><div class="eyebrow">Next free drink</div><h2>${view.creditsToNextReward} to go</h2><div class="progress" aria-label="${view.drinkCredits} of 8 credits toward the next free drink">${progressMarkup(view)}</div></div>
    <aside class="coffee-joke"><span aria-hidden="true">☕</span><div><div class="eyebrow">A little cup of motivation</div><p>${esc(joke)}</p></div><button class="joke-button" type="button" data-new-joke aria-label="Show another coffee joke">Another one</button></aside>
    <div class="history"><div class="eyebrow">Latest activity</div>${view.recentActivity.slice(0, 3).map(item => `<p>${esc(item.label)} · ${esc(item.actor)}</p>`).join('')}</div>
  </section>`;
}

function rewardsMarkup(view, revealedReward) {
  if (revealedReward) {
    return `<section class="tab-panel" role="tabpanel"><div class="reward-open center"><div class="eyebrow">Ready to redeem</div><h2>Show this to the crew</h2><img class="reward-qr" src="${revealedReward.qrDataUrl}" alt="Single-use Free Drink Reward QR"><p class="reward-timer">This code is valid for five minutes and disappears after Staff redeem it.</p><button class="secondary" type="button" data-close-reward>Back to rewards</button></div></section>`;
  }
  if (!view.availableRewards.length) {
    return `<section class="tab-panel empty-wallet center" role="tabpanel"><div class="empty-cup" aria-hidden="true">☕</div><h2>No free drinks waiting—yet.</h2><p>Keep sipping. Every eighth paid drink lands here.</p></section>`;
  }
  const count = view.availableRewards.length;
  return `<section class="tab-panel" role="tabpanel"><div class="wallet-intro"><div><div class="eyebrow">Reward wallet</div><h2>${count} drink${count === 1 ? '' : 's'} on the house</h2></div><span class="reward-stamp">FREE</span></div>
    <div class="reward-list">${view.availableRewards.map((reward, index) => `<article class="reward-card"><div><div class="eyebrow">Reward ${index + 1}</div><strong>${esc(reward.kind)}</strong><p>Does not expire until you use it.</p></div><button type="button" data-reward-id="${esc(reward.id)}">Open reward</button></article>`).join('')}</div>
    <p class="small center">Open a reward when you are at the counter. Its QR lasts five minutes.</p></section>`;
}

export function memberMarkup(view, { activeTab = 'tally', jokeIndex = view.lifetimeDrinkCredits, revealedReward } = {}) {
  return `<div class="mast"><strong>BEND &amp; BREW</strong><span>PATRICK'S CARD</span></div>
    <div class="member-hello"><div><div class="eyebrow">Hey Patrick</div><h2>Good to see you.</h2></div><img class="mini-card-qr" src="${view.cardQrDataUrl}" alt="Patrick's permanent Rewards Card QR"></div>
    ${tabsMarkup(view, activeTab)}
    ${activeTab === 'rewards' ? rewardsMarkup(view, revealedReward) : tallyMarkup(view, jokeIndex)}
    <a class="staff-link" href="/staff">Staff scanner</a>`;
}
