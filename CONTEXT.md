# Beneficial Ownership

The domain of who _really_ owns a company, as opposed to whose name appears on the register. Ownership
is layered deliberately — through holding companies, trusts and nominees, across jurisdictions chosen
for their secrecy — so the interesting questions are always about chains and shared attributes rather
than about single records.

## Language

### Parties

**Person**:
A natural human being who can hold a stake, serve as an officer, or act as a nominee.
_Avoid_: Individual, natural person, human

**Company**:
Any registered legal entity that can be owned — including trusts, foundations and partnerships, which
differ only by legal form.
_Avoid_: Entity, organisation, firm, corporation

**Legal form**:
The registered type of a Company: LLC, Trust, Foundation, SA, Partnership. A distinction of form, not
of kind — a Trust is owned and traversed exactly like an LLC.
_Avoid_: Company type, entity type

**Intermediary**:
A professional firm that forms or administers companies on a client's behalf — registered agent, law
firm, or corporate services provider. It never owns anything; it services.
_Avoid_: Agent, provider, service company

### Ownership

**Stake**:
One party's direct holding in one Company, carrying a percentage. The unit of ownership, and always
direct — a stake never spans more than one step.
_Avoid_: Share, holding, interest, position

**Ownership chain**:
A path of consecutive Stakes running from an owner down to a Company. Its length is its number of steps.
_Avoid_: Ownership path, chain of control, structure

**Effective ownership**:
The percentage one party ultimately holds in a Company, computed by multiplying the stake percentages
along an Ownership chain and summing across every distinct chain between the two.
_Avoid_: Indirect ownership, ultimate stake, true ownership

**Beneficial owner**:
The party that ultimately benefits from a Company, reached through Effective ownership rather than
appearing on its register.
_Avoid_: Ultimate owner, real owner, UBO (spell it out in prose)

**Registered owner**:
The party whose name appears on a Company's register for a Stake. May be a Nominee, in which case the
Beneficial owner is someone else entirely.
_Avoid_: Legal owner, owner of record, shareholder

**Nominee**:
A Person who holds a Stake or an Officer role in their own name on behalf of a Principal, concealing
them. The gap between the Registered owner and the Beneficial owner.
_Avoid_: Proxy, front, straw man

**Principal**:
The party a Nominee acts for.
_Avoid_: Beneficiary, real party, client

**Circular ownership**:
An Ownership chain that returns to a Company it already passed through. Makes Effective ownership
non-terminating unless chains are required to be acyclic, and is a recognised concealment structure in
its own right.
_Avoid_: Ownership loop, cycle, recursive ownership

### Roles and places

**Officer role**:
A Person's formal position at a Company — Director, Secretary, Shareholder of record. Distinct from
ownership: an officer controls without necessarily owning.
_Avoid_: Position, appointment, title

**Jurisdiction**:
The legal territory a Company is registered in, or a Person is a citizen of. Carries a secrecy score,
because jurisdiction choice is itself evidence of intent.
_Avoid_: Country, territory, domicile

**Address**:
A physical registration or residential address, shared between parties far more often than coincidence
explains. A mass-registration address is the classic weak signal.
_Avoid_: Location, premises, office

**Watchlist**:
A published register of sanctioned or otherwise flagged parties, maintained by an authority.
_Avoid_: Blacklist, sanctions list, denylist

### Analysis

**Hidden link**:
A short path connecting two parties that share no direct relationship — typically through a shared
Address, Intermediary or Officer. The finding that makes two apparently unrelated parties related.
_Avoid_: Connection, indirect link, association

**Hub**:
A node so widely shared that paths through it carry no information — a popular Jurisdiction, for
instance. Hidden links must be found in spite of Hubs, not through them.
_Avoid_: Supernode, high-degree node, popular node
