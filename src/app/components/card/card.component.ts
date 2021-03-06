import {Component, OnInit, Input} from '@angular/core';
import { SocketIoService, UserService } from '../../providers';
import {Card} from '../../models/card';
import {User} from '../../models/user';
@Component({
  selector: 'my-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss']
})
export class CardComponent implements OnInit {
  flip: boolean = false;
  user: User;
  @Input() item: Card;
  @Input() itemNumber: number;
  @Input() itemDemo: boolean = false;
  constructor(private messageService: SocketIoService, private userService: UserService ) {
    console.log(this.item);

    this.messageService.statusCard.subscribe( m => {
        if (m && this.item && m.id === this.item.id) {
          this.item = m ;
        }
      }, (e) => console.log(e)
    );
  }
  ngOnInit() {
    if (this.itemDemo === true) {
      this.user = new User({id: 1, username: 'the demo guy'});
      this.item.userId = this.user.id;
      this.item.username = this.user.username;
    } else {
      this.user = this.userService.getCurrentUser();
    }
  }
  getFlip($event) {
    if (this.item.state === false && this.itemDemo === false) {
      this.item.userId = this.user.id;
      this.messageService.sendCard(this.item);
    }
  }

}
