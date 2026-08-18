from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class AgentState(TypedDict):
    input: str
    messages: list[str]

def process_input(state: AgentState) -> AgentState:
    user_input = state["input"]
    response = f"Agent received: '{user_input}'. Processing multi-agent logic..."
    new_messages = list(state.get("messages", []))
    new_messages.append(response)
    return {"input": user_input, "messages": new_messages}

# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("processor", process_input)
workflow.add_edge(START, "processor")
workflow.add_edge("processor", END)

# Compile the graph
agent_graph = workflow.compile()

def run_sample_agent(prompt: str) -> dict:
    initial_state = {"input": prompt, "messages": []}
    result = agent_graph.invoke(initial_state)
    return result
