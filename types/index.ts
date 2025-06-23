export interface Event {
    id: string
    title: string
    description?: string
    start_date: string
    end_date: string
    time?: string
    color?: string
    created_by?: string
    created_at?: string
}

export interface Notification {
    id: string
    event_id: string
    user_id: string
    notify_date: string
    sent: boolean
    event?: Event
}