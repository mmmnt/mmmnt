  That changes the ADR-037 picture:                                                                                                         
                                                                                                                                            
  - Live verification target: production flmnt (mcp.production.flmnt.ai), e.g. this workspace's ::domain stream — no local stack needed     
  - Open question to verify first: the quorum watch spike polls the raw REST contract (GET {server}/streams/:id/entries, bearer auth) from  
  quorum core :3000. Does production flmnt expose that same REST surface, or only MCP (/mcp)? If MCP-only, the @mmmnt/quorum client in      
  ADR-037 should speak the MCP tool surface (peek_stream/slice_events) instead of raw REST — that's an ADR-level decision, not a detail     
  - Auth: flmnt mcp auth-header (used in .mcp.json) can mint the bearer token for testing; broker PKCE remains the productized path         
                                                                                                                                            
  Proposed ADR-037 kickoff:
  1. Probe production: read-only GET /streams/{2f84b12a…::domain}/entries with the flmnt auth header — establishes whether REST or MCP is   
  the integration contract                                                                                                                  
  2. Author ADR-037 in Confluence (re-base ADR-025 on flmnt streams: convergence gating, fold, rule table; REST-vs-MCP decision from step 1)
  3. Extract @mmmnt/quorum package from the spike code per the ADR                                                                          
  4. Live end-to-end: moment quorum watch <stream> --once against production → .domain/ JSONL → moment import --from-sift                   
                                                                                                                         
  Start with the probe?  

  watch doesn't have a non-mcp surface that needs to be exposed. it will still be exposed but behind authentication. a user account is required. we'd have to build signup specifically for moment where a user can register.

  what we can do on this side is establish the data contract. right now the state of the stream is natural language for contextual depth in the decision making process. there's a whole piece here where we haven't identified how to translate that NLU to machine-readable language that Moment can consume.

  the best we can do on this side for now is to establish the data contract in the format that Moment needs to receive, and that needs to be mocked so we can move forward. I need to innovate on the other side (flmnt + sift)