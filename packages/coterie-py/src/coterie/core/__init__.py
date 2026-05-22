"""Coterie core abstractions.

`core/` contains ONLY abstractions and registry plumbing. No concrete
adapters, modes, or providers live here. Concretes are in `adapters/`,
`modes/`, and `nodes/`. This is the boundary that keeps the orchestration
graph free of SDK imports — the dependency-inversion seam.
"""
