from langchain_core.tools import tool

@tool
def request_login():
    """
    Call this tool when the user requests an action that requires authentication 
    (like generating a render) but is currently not logged in.
    
    Returns:
        str: A distinct signal that the frontend will use to show a login button.
    """
    return "LOGIN_REQUIRED_UI_TRIGGER"
