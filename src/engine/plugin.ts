import {
  Message,
  PluginProfile,
  Api,
  ApiEventEmitter,
  PluginRequest,
  ExtractKey,
  PluginApi,
} from '../types'
import { EventEmitter } from 'events'

interface PluginLocation {
  resolveLocaton(element: HTMLElement): void
}

export class Plugin<T extends Api> implements PluginApi<T> {
  private id = 0
  private iframe: HTMLIFrameElement
  private pluginLocation: PluginLocation
  private origin: string
  private source: Window
  // Request to the plugin waiting in queue
  private requestQueue: Array<() => Promise<any>> = []
  // Request from outside to the plugin waiting for response from the plugin
  private pendingRequest: {
    [name: string]: {
      [id: number]: (payload: any) => void
    }
  } = {}

  public readonly name: T['name']
  public profile: PluginProfile<T>
  public events: ApiEventEmitter<T>
  public notifs = {}
  public request: (value: { name: string; key: string; payload: any }) => Promise<any>
  public activate: () => Promise<void>
  public deactivate: () => void

  constructor(profile: PluginProfile<T>, location?: PluginLocation) {
    if (location) this.pluginLocation = location

    this.profile = profile
    this.name = profile.name
    this.events = new EventEmitter() as ApiEventEmitter<T>

    const notifs = profile.notifications || {}
    for (const name in notifs) {
      this.notifs[name] = {}
      const keys = notifs[name] || []
      keys.forEach(key => {
        this.notifs[name][key] = (payload: any[]) => {
          this.postMessage({ action: 'notification', name, key, payload })
        }
      })
    }

    const getMessage = (e: MessageEvent) => this.getMessage(e)

    // Listen on message from the iframe and to the event
    this.activate = async () => {
      await this.create(profile)
      window.addEventListener('message', getMessage, false)
    }

    // Remove events that come from iframe
    this.deactivate = () => {
      this.iframe.remove()
      window.removeEventListener('message', getMessage, false)
    }
  }

  /** Get message from the iframe */
  private async getMessage(event: MessageEvent) {
    if (event.origin !== this.origin) return // Filter only messages that comes from this origin
    const message: Message =
      typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    switch (message.action) {
      case 'notification': {
        if (!message.payload) break
        this.events.emit(message.key, message.payload)
        break
      }
      case 'request': {
        const action = 'response'
        try {
          const payload = await this.request(message)
          const error = undefined
          this.postMessage({ ...message, action, payload, error })
        } catch (err) {
          const payload = undefined
          const error = err.message
          this.postMessage({ ...message, action, payload, error })
        }
        break
      }
      case 'response': {
        const { name, id, payload } = message
        this.pendingRequest[name][id](payload)
        delete this.pendingRequest[name][id]
        break
      }
      default: {
        throw new Error('Message should be a notification, request or response')
      }
    }
  }

  /**
   * Add a request for the plugin to the queue and execute it in time
   * @param requestInfo Information concerning the incoming request
   * @param method The name of the method to call
   * @param payload The arguments of this method
   */
  public addRequest(
    requestInfo: PluginRequest,
    method: ExtractKey<T, Function>,
    payload: any[],
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.profile.methods || !this.profile.methods.includes(method)) {
        reject(new Error(`Method ${method} is not exposed by ${this.profile.name}`))
      }
      // Add the current request into the queue
      this.requestQueue.push(async () => {
        this.id++
        this.postMessage({
          action: 'request',
          name: this.name,
          key: method as string,
          id: this.id,
          payload,
          requestInfo,
        })
        // Wait for the response from the plugin
        this.pendingRequest[this.name][this.id] = (result: any) => {
          resolve(result)
          // Remove current request and call next
          this.requestQueue.shift()
          if (this.requestQueue.length !== 0) this.requestQueue[0]()
        }
      })
      // If there is only one request waiting, call it
      if (this.requestQueue.length === 1) {
        this.requestQueue[0]()
      }
    })
  }

  /**
   * Create an iframe element
   * @param profile The profile of the plugin
   */
  private async create(profile: PluginProfile) {
    // Create
    try {
      this.iframe = document.createElement('iframe')
      this.iframe.setAttribute('sandbox', 'allow-scripts')
      this.iframe.setAttribute('seamless', 'true')
      this.iframe.src = profile.url
      if (profile.location) {
        const { name, key } = profile.location
        const message = {
          action: 'request',
          name,
          key,
          payload: { ...profile, element: this.iframe },
        }
        await this.request(message)
      } else if (this.pluginLocation) {
        this.pluginLocation.resolveLocaton(this.iframe)
      } else {
        document.body.appendChild(this.iframe)
      }
      // Wait for the iframe to load and handshake
      this.iframe.onload = () => {
        if (!this.iframe.contentWindow) {
          throw new Error('No window attached to Iframe yet')
        }
        this.origin = new URL(this.iframe.src).origin
        this.source = this.iframe.contentWindow
        this.postMessage({
          action: 'request',
          name: this.name,
          key: 'handshake',
        })
      }
    } catch (err) {
      console.log(err)
    }
  }

  /**
   * Post a message to the iframe of this plugin
   * @param message The message to post
   */
  private postMessage(message: Partial<Message>) {
    if (!this.source) {
      throw new Error('No window attached to Iframe yet')
    }
    const msg = JSON.stringify(message)
    this.source.postMessage(msg, this.origin)
  }
}
